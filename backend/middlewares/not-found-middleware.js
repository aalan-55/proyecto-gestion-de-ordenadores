/** @type {require("fastify").RouteHandler} */

const notFoundHandler = async (request, response) => { 
    return response.status(401).send({
        success: false, 
        code: "RUTA_NO_ENCONTRADA",
        message: `Ruta ${request.method} ${request.url} no encontrada`
    })
}

module.exports = { notFoundHandler }