import Chat from "../../controllers/chat.js";
import logger from "../../lib/logger/index.js";

const SOCKET_TIMEOUT = 5 * 60 * 1000;

const OPENAI_EVENTS = {
    TEXT_DELTA: 'textDelta',
    TEXT_DONE: 'textDone',
    ERROR: 'error'
};

function setTimer(socket) {
    if (socket.timeOutTimer) {
        clearTimeout(socket.timeOutTimer);
    }

    socket.timeOutTimer = setTimeout(() => {
        socket.disconnect(true);
    }, SOCKET_TIMEOUT);
}

function clearTimer(socket) {
    if (socket.timeOutTimer) {
        clearTimeout(socket.timeOutTimer);
    }
}

function initializeSocket(socket, controller) {
    try {
        setTimer(socket);
        controller.initialize(socket);
    } catch (error) {
        const errorMessage = `Error initializing socket: ${error.message || error}`;
        logger.error(errorMessage);
        socket.emit(Chat.EVENTS.ERROR, `Error encountered while initializing socket`);
    }
}

function handleSocket(webSocket) {
        webSocket.on('connection', (socket) => {
            const controller = new Chat();
            initializeSocket(socket, controller);

            socket.on(Chat.EVENTS.NEW_MESSAGE, async event => {
                try {
                    setTimer(socket);
                    const { message } = event;
                    const stream = await controller.handleMessage(message);

                    stream.on(OPENAI_EVENTS.TEXT_DELTA, async delta => {
                        socket.emit(Chat.EVENTS.SYSTEM_MESSAGE_CHUNK, delta.value);
                    });

                    stream.on(OPENAI_EVENTS.TEXT_DONE, async delta => {
                        socket.emit(Chat.EVENTS.SYSTEM_MESSAGE_END);
                    });

                    stream.on(OPENAI_EVENTS.ERROR, async error => {
                        const errorMessage = `Error encountered while handling message event: ${error.message || error}`;
                        logger.error(errorMessage);
                        socket.emit(Chat.EVENTS.ERROR, `Error encountered while handling message event`);
                    });

                } catch (error) {
                    const errorMessage = `Error handling message event: ${error.message || error}`;
                    logger.error(errorMessage);
                    socket.emit(Chat.EVENTS.ERROR, `Error encountered while handling message event`);
                }
            });

            socket.on(Chat.EVENTS.DISCONNECT, () => {
                clearTimer(socket);
                controller.disconnect(socket);
                socket.disconnect(true);
            });
        });
}

export default handleSocket;
