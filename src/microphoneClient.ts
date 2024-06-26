import fetch from "node-fetch";
import mic from "mic";
import say from "say";
import { prompt } from "./openAi";

const micSettings = {
  rate: "16000",
  channels: "1",
  debug: true,
  exitOnSilence: 6,
  fileType: "wav",
};

type ResponseObject = {
  text: string;
  intents: { name: string; confidence: number }[];
  type: string;
};

async function parseResponseStream(
  response: fetch.Response
): Promise<ResponseObject[]> {
  const text = await response.text();
  const splitText = text.split("\r");

  return splitText
    .filter((text) => text.trim() !== "")
    .map((text) => {
      try {
        return JSON.parse(text);
      } catch (error) {
        console.error("Error parsing JSON:", error);
        return null;
      }
    })
    .filter((response) => response !== null) as ResponseObject[];
}

export class MicrophoneClient {
  static WAKE_WORD_INTENT: string = "wake_word";
  static CONFIDENCE_THRESHOLD: number = 0.8;

  private accessToken: string = "";
  private wakeWordAudioBuffer: Buffer[] = [];
  private isListeningForWakeWord: boolean = false;
  private isListeningForCommand: boolean = false;
  private wakeWordMicInstance = mic(micSettings);
  private commandMicInstance = mic(micSettings);

  constructor() {
    this.accessToken = process.env.WIT_AI_SERVER_ACCESS_TOKEN!;
  }

  public init() {
    this.wakeWordAudioBuffer = [];
    this.isListeningForWakeWord = false;
    this.isListeningForCommand = false;
    this.wakeWordMicInstance = mic(micSettings);
    this.commandMicInstance = mic(micSettings);

    this.listenForWakeWord();
  }

  private logListeningState() {
    console.log({
      isListeningForWakeWord: this.isListeningForWakeWord,
      isListeningForCommand: this.isListeningForCommand,
    });
  }

  private listenForWakeWord() {
    this.isListeningForWakeWord = true;
    this.isListeningForCommand = false;
    this.logListeningState();

    const micInputStream = this.wakeWordMicInstance.getAudioStream();
    micInputStream.removeAllListeners(); // Remove any existing listeners
    micInputStream.on("data", this.handleWakeWordData.bind(this));
    micInputStream.on("error", this.handleMicError.bind(this));
    micInputStream.on("silence", () => {});

    this.wakeWordMicInstance.start();
    console.log("Listening for wake word...");
  }

  private handleWakeWordData(data: Buffer) {
    this.wakeWordAudioBuffer.push(data);

    if (this.wakeWordAudioBuffer.length >= 10) {
      const audioBufferCombined = Buffer.concat(this.wakeWordAudioBuffer);
      this.wakeWordAudioBuffer = [];

      fetch("https://api.wit.ai/speech?v=20240530", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "audio/wav",
        },
        body: audioBufferCombined,
      })
        .then(this.handleWakeWordResponse.bind(this))
        .catch(this.handleFetchError.bind(this));
    }
  }

  private async handleWakeWordResponse(response: fetch.Response) {
    const responses = await parseResponseStream(response);

    responses.forEach((jsonObject) => {
      if (
        jsonObject.intents &&
        jsonObject.intents.length > 0 &&
        jsonObject.intents[0].name === MicrophoneClient.WAKE_WORD_INTENT &&
        jsonObject.intents[0].confidence >=
          MicrophoneClient.CONFIDENCE_THRESHOLD &&
        jsonObject.type === "FINAL_UNDERSTANDING"
      ) {
        console.log(jsonObject);
        this.onWakeWordDetected();
      }
    });
  }

  private handleFetchError(err: Error) {
    console.error("Error in Speech Recognition:", err);
  }

  private handleMicError(err: Error) {
    console.error("Error in Input Stream:", err);
  }

  private onWakeWordDetected() {
    console.log(
      `\n===================\n\nWAKE WORD DETECTED\n\n===================\n`
    );
    this.isListeningForWakeWord = false;
    this.wakeWordMicInstance.stop();
    this.listenForCommand();
  }

  private listenForCommand() {
    this.isListeningForCommand = true;
    this.isListeningForWakeWord = false;
    this.logListeningState();

    const micInputStream = this.commandMicInstance.getAudioStream();
    micInputStream.removeAllListeners(); // Remove any existing listeners
    let commandAudioBuffer: Buffer[] = [];

    micInputStream.on("data", (data: Buffer) => commandAudioBuffer.push(data));
    micInputStream.on("silence", () =>
      this.handleCommandSilence(commandAudioBuffer)
    );
    micInputStream.on("error", this.handleMicError.bind(this));

    this.commandMicInstance.start();
    console.log("Listening for command...");
  }

  private async handleCommandSilence(commandAudioBuffer: Buffer[]) {
    const commandAudioBufferCombined = Buffer.concat(commandAudioBuffer);
    commandAudioBuffer.length = 0;

    try {
      const response = await fetch("https://api.wit.ai/speech?v=20240530", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "audio/wav",
        },
        body: commandAudioBufferCombined,
      });

      const responses = await parseResponseStream(response);
      const finalResponse = responses.find(
        (response) => response.type === "FINAL_UNDERSTANDING"
      );
      this.onCommandDetected(finalResponse?.text || "");
    } catch (err: any) {
      console.error("Error in Command Recognition:", err);
    }

    this.commandMicInstance.stop();
  }

  private async onCommandDetected(command: string) {
    this.isListeningForCommand = false;
    console.log(
      `\n===================\n\nUSER ASKED: ${command}\n\n===================\n`
    );

    const response = await prompt(command);
    console.log(
      `\n===================\n\nAI RESPONSE: ${response}\n\n===================\n`
    );

    say.speak(response, "Samantha", 1.0, (err) => {
      if (err) {
        console.error(err);
      } else {
        console.log("Text has been spoken.");
      }

      // Reset the microphone client to listen for the wake word again
      this.init();
    });
  }
}
