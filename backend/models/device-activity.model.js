const { Schema, model } = require("mongoose");

const processSchema = new Schema(
    {
        pid: { type: Number, default: null },
        name: { type: String, default: "" },
        cpu: { type: Number, default: null },
        gpu: { type: Number, default: null },
        memory: { type: Number, default: null }
    },
    { _id: false }
);

const deviceActivitySchema = new Schema(
    {
        deviceId: {
            type: String,
            required: true,
            index: true
        },
        capturedAt: {
            type: Date,
            default: Date.now,
            index: true
        },
        cpuUsage: Number,
        gpuUsage: Number,
        memoryUsage: Number,
        processList: [processSchema],
        gpuProcessList: [processSchema]
    },
    { timestamps: true }
);

deviceActivitySchema.index({ deviceId: 1, capturedAt: -1 });

module.exports = model("DeviceActivity", deviceActivitySchema);
