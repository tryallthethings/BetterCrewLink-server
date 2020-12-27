import express from 'express';
import { Server } from 'http';
import { Server as HttpsServer } from 'https';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import socketIO from 'socket.io';
import Tracer from 'tracer';
import morgan from 'morgan';
import publicIp from 'public-ip';
import TurnServer from 'node-turn';
import crypto from 'crypto';
import peerConfig  from './peerConfig';
import { ICEServer } from './ICEServer';

const httpsEnabled = !!process.env.HTTPS;

const port = parseInt(process.env.PORT || (httpsEnabled ? '443' : '9736'));

const sslCertificatePath = process.env.SSLPATH || process.cwd();
const supportedVersions = readdirSync(join(process.cwd(), 'offsets')).map(file => file.replace('.yml', ''));

const logger = Tracer.colorConsole({
	format: "{{timestamp}} <{{title}}> {{message}}"
});

const turnLogger = Tracer.colorConsole({
	format: "{{timestamp}} <{{title}}> <ice> {{message}}",
	level: peerConfig.integratedRelay.debugLevel.toLowerCase()
})

const app = express();
let server: HttpsServer | Server;
if (httpsEnabled) {
	server = new HttpsServer({
		key: readFileSync(join(sslCertificatePath, 'privkey.pem')),
		cert: readFileSync(join(sslCertificatePath, 'fullchain.pem'))
	}, app);
} else {
	server = new Server(app);
}

let turnServer: TurnServer | null = null;
if (peerConfig.integratedRelay.enabled) {
	turnServer = new TurnServer({
		minPort: peerConfig.integratedRelay.minPort,
		maxPort: peerConfig.integratedRelay.maxPort,
		listeningPort: peerConfig.integratedRelay.listeningPort,
		authMech: 'long-term',
		debugLevel: peerConfig.integratedRelay.debugLevel,
		realm: 'crewlink',
		debug: (level, message) => {
			turnLogger[level.toLowerCase()](message)
		}
	})
	
	turnServer.start();
}

const io = socketIO(server);

const playerIds = new Map<string, number>();

interface Signal {
	data: string;
	to: string;
}

interface SetIDsPacket {
	[key: string]: number
}

interface ClientPeerConfig {
	forceRelayOnly: boolean;
	iceServers: ICEServer[]
}

app.set('view engine', 'pug');
app.use(morgan('combined'));
app.use(express.static('offsets'));
let connectionCount = 0;
let ip = process.env.IP_ADDRESS;
let address = process.env.ADDRESS;

app.get('/', (_, res) => {
	res.render('index', { connectionCount, address });
});

app.get('/health', (req, res) => {
	res.json({
		uptime: process.uptime(),
		connectionCount,
		address,
		name: process.env.NAME,
		supportedVersions
	});
});

io.on('connection', (socket: socketIO.Socket) => {
	connectionCount++;
	logger.info("Total connected: %d", connectionCount);
	let code: string | null = null;

	const clientPeerConfig: ClientPeerConfig = {
		forceRelayOnly: peerConfig.forceRelayOnly,
		iceServers: peerConfig.iceServers? [...peerConfig.iceServers] : []
	}

	if (turnServer) {
		const turnCredential = crypto.randomBytes(32).toString('base64');
		turnServer.addUser(socket.id, turnCredential);
		logger.info(`Adding socket "${socket.id}" as TURN user.`)
		clientPeerConfig.iceServers.push({
			urls: `turn:${ip}:${peerConfig.integratedRelay.listeningPort}`,
			username: socket.id,
			credential: turnCredential
		});
	}

	socket.emit('clientPeerConfig', clientPeerConfig);

	socket.on('join', (c: string, id: number) => {
		if (typeof c !== 'string' || typeof id !== 'number') {
			socket.disconnect();
			logger.error(`Socket %s sent invalid join command: %s %d`, socket.id, c, id);
			return;
		}
		code = c;
		socket.join(code);
		socket.to(code).broadcast.emit('join', socket.id, id);

		const socketsInLobby = Object.keys(io.sockets.adapter.rooms[code].sockets);
		const ids: SetIDsPacket = {};
		for (const s of socketsInLobby) {
			if (s !== socket.id)
				ids[s] = playerIds.get(s);
		}
		socket.emit('setIds', ids);
	});

	socket.on('id', (id: number) => {
		if (typeof id !== 'number') {
			socket.disconnect();
			logger.error(`Socket %s sent invalid id command: %d`, socket.id, id);
			return;
		}
		playerIds.set(socket.id, id);
		socket.to(code).broadcast.emit('setId', socket.id, id);
	});


	socket.on('leave', () => {
		if (code) socket.leave(code);
	});

	socket.on('signal', (signal: Signal) => {
		if (typeof signal !== 'object' || !signal.data || !signal.to || typeof signal.to !== 'string') {
			socket.disconnect();
			logger.error(`Socket %s sent invalid signal command: %j`, socket.id, signal);
			return;
		}
		const { to, data } = signal;
		io.to(to).emit('signal', {
			data,
			from: socket.id
		});
	});

	socket.on('disconnect', () => {
		connectionCount--;
		playerIds.delete(socket.id);

		if (turnServer) {
			logger.info(`Removing socket "${socket.id}" as TURN user.`)
			turnServer.removeUser(socket.id);
		}

		logger.info("Total connected: %d", connectionCount);
	});
});

(async () => {
	if (!ip) {
		ip = await publicIp.v4();
	}

	if (!address) {
		address = `${httpsEnabled ? 'https' : 'http'}://${ip}:${port}`;
	}

	server.listen(port);
	logger.info('CrewLink Server started: %s', address);
})();