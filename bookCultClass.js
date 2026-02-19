"use strict";

const https = require("https");

function requiredEnv(name) {
  const v = process.env[name];
  if (!v || !String(v).trim()) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v.trim();
}

function env(name, def) {
  const v = process.env[name];
  return v && String(v).trim() ? v.trim() : def;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function httpsJson({ host, path, method, headers, body }) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { host, path, method, headers },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          const status = res.statusCode || 0;
          const ct = (res.headers["content-type"] || "").toLowerCase();

          let parsed = data;
          if (data && ct.includes("application/json")) {
            try {
              parsed = JSON.parse(data);
            } catch (e) {
              // ignore JSON parse, fall back to string
            }
          }

          if (status < 200 || status >= 300) {
            const err = new Error(`HTTP ${status} ${method} ${path}: ${typeof parsed === "string" ? parsed : JSON.stringify(parsed)}`);
            err.status = status;
            err.response = parsed;
            return reject(err);
          }
          resolve(parsed);
        });
      }
    );

    req.on("error", reject);
    if (body !== undefined) req.write(typeof body === "string" ? body : JSON.stringify(body));
    req.end();
  });
}

// ---- Curefit/Cult API client ----
// These match the patterns commonly used by older Curefit booking scripts.
// You may need to adjust endpoints if Curefit changes them.
async function getClasses({ host, headers }) {
  return httpsJson({
    host,
    path: "/api/cult/classes/v2?productType=FITNESS",
    method: "GET",
    headers,
  });
}

async function bookClass({ host, headers, activityId }) {
  return httpsJson({
    host,
    path: `/api/cult/class/${activityId}/book`,
    method: "POST",
    headers,
    body: {}, // API expects JSON body (can be empty object)
  });
}

function pickSlots({ classesResponse, centerId, slot, workoutIdsPreferred }) {
  // The existing repo script assumes a structure like:
  // classes.classByDateMap[date].classByTimeList[].centerWiseClasses[].classes[]
  // We keep the same assumptions here.
  const days = classesResponse?.days;
  const classByDateMap = classesResponse?.classByDateMap;

  if (!Array.isArray(days) || !classByDateMap) {
    throw new Error("Unexpected classes response format: missing days/classByDateMap");
  }

  // Choose the latest date available in the response (same as original repo logic).
  const date = days[days.length - 1]?.id;
  if (!date) throw new Error("Could not determine latest bookable date from response");

  const classesForDay = classByDateMap[date];
  if (!classesForDay?.classByTimeList) throw new Error(`No classByTimeList for date=${date}`);

  const timeBlock = classesForDay.classByTimeList.find((t) => String(t.id) === String(slot));
  if (!timeBlock) return [];

  const centerBlock = (timeBlock.centerWiseClasses || []).find((c) => String(c.centerId) === String(centerId));
  if (!centerBlock) return [];

  const classes = centerBlock.classes || [];
  const preferredSet = new Set(workoutIdsPreferred.map(String));

  const candidates = classes
    .filter((c) => preferredSet.has(String(c.workoutId)) && c.state === "AVAILABLE")
    .map((c) => ({
      activityId: c.id,
      workoutId: c.workoutId,
      state: c.state,
      startTime: c.startTime,
      endTime: c.endTime,
      raw: c,
    }));

  // Sort by preferred workout order
  candidates.sort((a, b) => {
    const ai = workoutIdsPreferred.map(String).indexOf(String(a.workoutId));
    const bi = workoutIdsPreferred.map(String).indexOf(String(b.workoutId));
    return ai - bi;
  });

  return candidates;
}

async function main() {
  const host = env("CUREFIT_HOST", "www.cure.fit");

  const st = requiredEnv("CUREFIT_ST"); // <<<FILL via GitHub Secrets>>>
  const at = requiredEnv("CUREFIT_AT"); // <<<FILL via GitHub Secrets>>>
  const osName = env("CUREFIT_OSNAME", "ios");

  const centerId = requiredEnv("CUREFIT_CENTER_ID"); // <<<FILL>>>
  const workoutIds = requiredEnv("CUREFIT_WORKOUT_IDS") // <<<FILL e.g. "37,9,8">>>
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const slot = env("CUREFIT_SLOT", "07:00:00");

  const retryAttempts = parseInt(env("RETRY_ATTEMPTS", "6"), 10);
  const retryDelaySeconds = parseInt(env("RETRY_DELAY_SECONDS", "20"), 10);

  const headers = {
    accept: "application/json",
    "content-type": "application/json",
    "user-agent": "GH-Actions-Booking-Bot",
    st,
    at,
    osname: osName,
  };

  console.log(`[info] Host=${host} Slot=${slot} Center=${centerId} Workouts=${workoutIds.join(",")}`);
  console.log(`[info] Will retry up to ${retryAttempts} times, delay ${retryDelaySeconds}s`);

  let lastErr;
  for (let attempt = 1; attempt <= retryAttempts; attempt++) {
    try {
      console.log(`[info] Attempt ${attempt}/${retryAttempts}: fetching classes...`);
      const classes = await getClasses({ host, headers });

      const slots = pickSlots({
        classesResponse: classes,
        centerId,
        slot,
        workoutIdsPreferred: workoutIds,
      });

      if (!slots.length) {
        throw new Error("No AVAILABLE classes found for your filters (slot/center/workoutIds).");
      }

      const chosen = slots[0];
      console.log(`[info] Found candidate: activityId=${chosen.activityId}, workoutId=${chosen.workoutId}, state=${chosen.state}`);

      console.log(`[info] Booking activityId=${chosen.activityId} ...`);
      const booked = await bookClass({ host, headers, activityId: chosen.activityId });
      console.log("[success] Booked. Response:", typeof booked === "string" ? booked : JSON.stringify(booked));
      return;
    } catch (e) {
      lastErr = e;
      console.error(`[warn] Attempt ${attempt} failed: ${e.message}`);
      if (attempt < retryAttempts) {
        await sleep(retryDelaySeconds * 1000);
      }
    }
  }

  console.error("[error] All attempts failed.");
  throw lastErr;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});