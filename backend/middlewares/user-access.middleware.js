/**
 * Middleware para verificar JWT_TOKENS
 * 
 * @param {require("fastify").FastifyRequest} request 
 * @param {require("fastify").FastifyReply} response 
*/

const { HttpError } = require("../classes/http-error.class");

const verifyAuthAccess = async (request, response) => {
    if (!request.headers.authorization) {
        throw new HttpError("No se proporcionó un token de autorización.", 401);
    }

    try {
        await request.jwtVerify();
    } catch(_error){
        throw new HttpError("No tienes sesión Iniciada.", 401)
    }
}

module.exports = { verifyAuthAccess }