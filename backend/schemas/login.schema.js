module.exports = {
    $id: "LoginSchema",

    body: {
        type: "object",
        required: ["password", "username"],

        properties: {
            username: {
                type: "string"
            },
            password: {
                type: "string",
                minLength: 8
            }
        }
    }
}