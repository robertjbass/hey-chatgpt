import fetch from "node-fetch";
import mic from "mic";

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

  const responses = splitText
    .filter((text) => text.trim() !== "")
    .map((text) => {
      try {
        const parsedText = JSON.parse(text);
        const confidenceString = text.includes("confidence")
          ? text.split('"confidence": ')[1].split(",")[0].trim()
          : "";
        const confidence = confidenceString ? parseFloat(confidenceString) : 0;
        return { ...parsedText, confidence };
      } catch (error) {
        console.error("Error parsing JSON:", error);
        return null;
      }
    })
    .filter((response) => response);

  return responses;
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

    this.logListeningState();

    const micInputStream = this.wakeWordMicInstance.getAudioStream();

    micInputStream.on("data", (data: Buffer) => {
      // Accumulate audio data
      this.wakeWordAudioBuffer.push(data);

      // Process the audio data every second
      if (this.wakeWordAudioBuffer.length >= 10) {
        const audioBufferCombined = Buffer.concat(this.wakeWordAudioBuffer);
        this.wakeWordAudioBuffer = []; // Clear the buffer

        // Send the combined audio buffer to Wit.ai
        fetch("https://api.wit.ai/speech?v=20240530", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            "Content-Type": "audio/wav",
          },
          body: audioBufferCombined,
        })
          .then(async (response) => {
            const responses = await parseResponseStream(response);

            responses.forEach((jsonObject) => {
              if (
                jsonObject.intents &&
                jsonObject.intents.length > 0 &&
                jsonObject.intents[0].name ===
                  MicrophoneClient.WAKE_WORD_INTENT &&
                jsonObject.intents[0].confidence >=
                  MicrophoneClient.CONFIDENCE_THRESHOLD &&
                jsonObject.type === "FINAL_UNDERSTANDING"
              ) {
                console.log(jsonObject);
                this.onWakeWordDetected();
              }
            });
          })
          .catch((err: Error) => {
            console.error("Error in Speech Recognition:", err);
          });
      }
    });

    micInputStream.on("error", (err: Error) => {
      console.error("Error in Input Stream:", err);
    });

    this.wakeWordMicInstance.start();
    console.log("Listening for wake word...");
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

    this.logListeningState();

    const micInputStream = this.commandMicInstance.getAudioStream();
    let commandAudioBuffer: Buffer[] = [];

    micInputStream.on("data", (data: Buffer) => {
      commandAudioBuffer.push(data);
    });

    micInputStream.on("silence", async () => {
      const commandAudioBufferCombined = Buffer.concat(commandAudioBuffer);
      commandAudioBuffer = []; // Clear the buffer

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
    });

    micInputStream.on("error", (err: Error) => {
      console.error("Error in Input Stream:", err);
    });

    this.commandMicInstance.start();
    console.log("Listening for command...");
  }

  private onCommandDetected(command: string) {
    this.isListeningForCommand = false;
    console.log(
      `\n===================\n\nUSER ASKED: ${command}\n\n===================\n`
    );
  }
}
