import "dotenv/config";
import { MicrophoneClient } from "./microphoneClient";

const micSession = new MicrophoneClient();
micSession.init();
