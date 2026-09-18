const deviceModel = require("../models/device.model");
const deviceActivityModel = require("../models/device-activity.model");

function toNumberOrNull(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function normalizePercent(value) {
    const n = toNumberOrNull(value);
    if (n === null) return null;
    if (n < 0) return 0;
    if (n > 100) return 100;
    return Math.round(n * 100) / 100;
}

function normalizeProcessList(rawList, metricKey) {
    if (!Array.isArray(rawList)) return [];
    return rawList
        .slice(0, 60)
        .map((item) => {
            if (!item || typeof item !== "object") return null;
            const name = String(item.name || item.process || item.command || "").trim();
            const pid = toNumberOrNull(item.pid);
            const cpu = toNumberOrNull(item.cpu);
            const gpu = toNumberOrNull(item.gpu);
            const memory = toNumberOrNull(item.memory);
            const metric = toNumberOrNull(item[metricKey]);

            return {
                pid,
                name,
                cpu: cpu === null ? metric : cpu,
                gpu: gpu === null && metricKey === "gpu" ? metric : gpu,
                memory
            };
        })
        .filter((p) => p && p.name);
}

function round2(value) {
    if (!Number.isFinite(value)) return null;
    return Math.round(value * 100) / 100;
}

async function persistDeviceTelemetry(payload) {
    const deviceId = String(payload?.deviceName || payload?.deviceId || "").trim();
    if (!deviceId) {
        throw new Error("DEVICE_ID_REQUIRED");
    }

    const foundDevice = await deviceModel.findOne({ deviceId }).exec();
    if (!foundDevice) {
        throw new Error("DEVICE_NOT_FOUND");
    }

    const cpuUsage = normalizePercent(payload?.cpuUsage);
    const gpuUsage = normalizePercent(payload?.gpuUsage);
    const memoryUsage = normalizePercent(payload?.memoryUsage);
    const processList = normalizeProcessList(payload?.processList, "cpu");
    const gpuProcessList = normalizeProcessList(payload?.gpuProcessList, "gpu");
    const now = new Date();

    foundDevice.cpuUsage = cpuUsage;
    foundDevice.gpuUsage = gpuUsage;
    foundDevice.memoryUsage = memoryUsage;
    foundDevice.processList = processList;
    foundDevice.gpuProcessList = gpuProcessList;
    foundDevice.lastInfoTime = now;
    await foundDevice.save();

    await deviceActivityModel.create({
        deviceId,
        capturedAt: now,
        cpuUsage,
        gpuUsage,
        memoryUsage,
        processList,
        gpuProcessList
    });

    return {
        deviceId,
        capturedAt: now,
        cpuUsage,
        gpuUsage,
        memoryUsage
    };
}

function average(values) {
    const valid = values.filter((v) => Number.isFinite(v));
    if (!valid.length) return null;
    return round2(valid.reduce((acc, v) => acc + v, 0) / valid.length);
}

function processTopNames(rows, key) {
    const counter = new Map();
    for (const row of rows) {
        const list = Array.isArray(row?.[key]) ? row[key] : [];
        for (const p of list) {
            const name = String(p?.name || "").trim();
            if (!name) continue;
            counter.set(name, (counter.get(name) || 0) + 1);
        }
    }
    return [...counter.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([name, seen]) => ({ name, seen }));
}

function buildBuckets(rows, bucketMs) {
    const byBucket = new Map();
    for (const row of rows) {
        const t = new Date(row.capturedAt).getTime();
        const bucketStart = Math.floor(t / bucketMs) * bucketMs;
        const arr = byBucket.get(bucketStart) || [];
        arr.push(row);
        byBucket.set(bucketStart, arr);
    }

    return [...byBucket.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([bucketStart, group]) => ({
            from: new Date(bucketStart).toISOString(),
            to: new Date(bucketStart + bucketMs - 1).toISOString(),
            samples: group.length,
            avgCpuUsage: average(group.map((r) => r.cpuUsage)),
            avgGpuUsage: average(group.map((r) => r.gpuUsage)),
            avgMemoryUsage: average(group.map((r) => r.memoryUsage)),
            topCpuProcesses: processTopNames(group, "processList"),
            topGpuProcesses: processTopNames(group, "gpuProcessList")
        }));
}

async function buildActivitySummary({ 
    deviceId, 
    onlineDeviceIds = [], 
    startDate = null, 
    endDate = null 
} = {}) {
    const now = Date.now();
    const oneHourAgo = new Date(now - 60 * 60 * 1000); // 1 hour
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000); // 1 day
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000); // 30 days for history

    const deviceFilter = {};
    if (deviceId) {
        deviceFilter.deviceId = String(deviceId).trim();
    }

    const devices = await deviceModel
        .find(deviceFilter)
        .select({ deviceId: 1, cpuUsage: 1, gpuUsage: 1, memoryUsage: 1, lastInfoTime: 1 })
        .lean()
        .exec();

    const ids = devices.map((d) => d.deviceId);
    if (!ids.length) {
        return { generatedAt: new Date().toISOString(), devices: [] };
    }

    const query = {
        deviceId: { $in: ids },
    };

    if (startDate) {
        query.capturedAt = { ...query.capturedAt, $gte: new Date(startDate) };
    } else {
        query.capturedAt = { ...query.capturedAt, $gte: thirtyDaysAgo };
    }

    if (endDate) {
        const endOfDay = new Date(endDate);
        endOfDay.setHours(23, 59, 59, 999); // Include the whole end day
        query.capturedAt = { ...query.capturedAt, $lte: endOfDay };
    }

    const snapshots = await deviceActivityModel
        .find(query)
        .sort({ capturedAt: -1 })
        .lean()
        .exec();

    const byDevice = new Map();
    for (const s of snapshots) {
        const arr = byDevice.get(s.deviceId) || [];
        arr.push(s);
        byDevice.set(s.deviceId, arr);
    }

    const onlineSet = new Set((onlineDeviceIds || []).map((id) => String(id).trim()));

    const summary = devices.map((device) => {
        const rows = byDevice.get(device.deviceId) || [];
        
        // Si se pide un dispositivo concreto (vista Historial), aumentamos el límite a 1000 
        
        // Si se pide un dispositivo concreto (vista Historial), aumentamos el límite a 1000 
        // para que las agregaciones (semanal/mensual) tengan datos suficientes.
        const limit = deviceId ? 1000 : 100;
        const recentRows = rows.slice(0, limit);

        const midRows = rows.filter(
            (r) => new Date(r.capturedAt) < oneHourAgo && new Date(r.capturedAt) >= oneDayAgo
        );
        const oldRows = rows.filter((r) => new Date(r.capturedAt) < oneDayAgo);

        return {
            deviceId: device.deviceId,
            online: onlineSet.has(device.deviceId),
            lastInfoTime: device.lastInfoTime || null,
            lastRefreshRequestAt: device.lastRefreshRequestAt || null,
            current: {
                cpuUsage: normalizePercent(device.cpuUsage),
                gpuUsage: normalizePercent(device.gpuUsage),
                memoryUsage: normalizePercent(device.memoryUsage)
            },
            recentDetailed: recentRows.map((row) => ({
                timestamp: row.capturedAt, // Mapeamos a timestamp para el frontend
                cpuUsage: normalizePercent(row.cpuUsage),
                gpuUsage: normalizePercent(row.gpuUsage),
                memoryUsage: normalizePercent(row.memoryUsage),
                processList: Array.isArray(row.processList) ? row.processList.slice(0, 6) : [],
                gpuProcessList: Array.isArray(row.gpuProcessList)
                    ? row.gpuProcessList.slice(0, 6)
                    : []
            })),
            midTermSummary: buildBuckets(midRows, 15 * 60 * 1000),
            longTermSummary: buildBuckets(oldRows, 24 * 60 * 60 * 1000)
        };
    });

    return {
        generatedAt: new Date().toISOString(),
        devices: summary
    };
}

module.exports = {
    persistDeviceTelemetry,
    buildActivitySummary
};
