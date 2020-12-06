import fs from 'fs';
import path from 'path';

const ICE_CONFIG_PATH = path.join(__dirname, '..', 'config', 'ice-servers.json');
const DEFAULT_ICE_CONFIG = {
	iceServers: [
		{
			urls: 'stun:stun.l.google.com:19302'
		}
	]
};

let iceConfig: RTCConfiguration = DEFAULT_ICE_CONFIG;

if (fs.existsSync(ICE_CONFIG_PATH)) {
	try {
		iceConfig = JSON.parse(fs.readFileSync(ICE_CONFIG_PATH).toString('utf8'));
	} catch (err) {
		console.error(`Unable to load ICE server config file. Make sure it is valid JSON.\n${err}`);
	}
}

export default iceConfig;