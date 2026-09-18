module.exports = {
    $id: "ReserveSchema",
    
    body: {
        type: "object",
        required: ["reason", "reserve"],

        properties: {
            reason: {
                type: "string"
            },

            reserve: {
                type: "string"
            },
            reserveWeekEnd: {
                type: "string"
            },
            monthName: {
                type: "string"
            },

            // opcional para admin
            action: { type: "string" },
            adminNote: { type: "string" },
            deviceId: { type: "string" }
        }
    }

}
