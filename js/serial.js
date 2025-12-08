class SerialManager {
    constructor(onLine, onError, onOpen, onClose) {
        this.onLine = onLine;
        this.onError = onError;
        this.onOpen = onOpen;
        this.onClose = onClose;
        this.port = null;
        this.reader = null;
        this.decoder = new TextDecoder();
        this.buffer = '';
    }

    async connect() {
        if (!('serial' in navigator)) {
            if (this.onError) this.onError(new Error('Web Serial not supported'));
            return;
        }

        if (this.port) {
            // Already connected; toggle to disconnect
            await this.disconnect();
            return;
        }

        try {
            this.port = await navigator.serial.requestPort();
            await this.port.open({ baudRate: 115200 });
            if (this.onOpen) this.onOpen();
            this.readLoop();
        } catch (err) {
            if (this.onError) this.onError(err);
        }
    }

    async disconnect() {
        try {
            if (this.reader) {
                await this.reader.cancel();
            }
            if (this.port) {
                await this.port.close();
            }
        } catch (err) {
            console.warn('Error during serial disconnect', err);
        } finally {
            this.port = null;
            this.reader = null;
            this.buffer = '';
            if (this.onClose) this.onClose();
        }
    }

    async readLoop() {
        if (!this.port?.readable) return;
        this.reader = this.port.readable.getReader();

        try {
            // eslint-disable-next-line no-constant-condition
            while (true) {
                const { value, done } = await this.reader.read();
                if (done) break;
                if (value) {
                    const chunk = this.decoder.decode(value, { stream: true });
                    this.buffer += chunk;
                    let newlineIndex;
                    while ((newlineIndex = this.buffer.indexOf('\n')) >= 0) {
                        const line = this.buffer.slice(0, newlineIndex);
                        this.buffer = this.buffer.slice(newlineIndex + 1);
                        if (this.onLine) this.onLine(line);
                    }
                }
            }
        } catch (err) {
            if (this.onError) this.onError(err);
        } finally {
            await this.disconnect();
        }
    }
}
