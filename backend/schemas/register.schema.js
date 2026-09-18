module.exports = {
    $id: "RegisterSchema",
    
    body: {
        type: "object",
        required: ["email", "requestType"],

        properties: {
            email: {
                type: "string",
                format: "email"
            },

            course: {
                type: "string",
            },
            project: {
                type: "string"
            },
            motives: {
                type: "string"
            },
            requestType: {
                type: "string",
                enum: ["PROYECTO", "INVESTIGACION"]
            }
        }
    }

}
