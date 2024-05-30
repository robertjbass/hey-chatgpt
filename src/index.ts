import fetch from "node-fetch";
// @ts-ignore
import mic from "mic";
import "dotenv/config";

const accessToken = process.env.WIT_AI_SERVER_ACCESS_TOKEN;

// Wake word to detect
const WAKE_WORD_INTENT = "wake_word";
const CONFIDENCE_THRESHOLD = 0.8;

// Function to handle detected wake word
function onWakeWordDetected() {
  console.log("IT WORKED!");
  // Add your logic here for what happens when the wake word is detected
}

// Buffer to collect audio data
let audioBuffer: Buffer[] = [];

// Start recording and detecting
const micInstance = mic({
  rate: "16000",
  channels: "1",
  debug: true,
  exitOnSilence: 6,
  fileType: "wav",
});

const micInputStream = micInstance.getAudioStream();

micInputStream.on("data", (data: Buffer) => {
  // Accumulate audio data
  audioBuffer.push(data);

  // Process the audio data every second
  if (audioBuffer.length >= 10) {
    const audioBufferCombined = Buffer.concat(audioBuffer);
    audioBuffer = []; // Clear the buffer

    // Send the combined audio buffer to Wit.ai
    fetch("https://api.wit.ai/speech?v=20240530", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "audio/wav",
      },
      body: audioBufferCombined,
    })
      .then(async (response) => {
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
              const confidence = confidenceString
                ? parseFloat(confidenceString)
                : 0;
              return { ...parsedText, confidence };
            } catch (error) {
              console.error("Error parsing JSON:", error);
              return null;
            }
          })
          .filter((response) => response);

        responses.forEach((jsonObject) => {
          if (
            jsonObject.intents &&
            jsonObject.intents.length > 0 &&
            jsonObject.intents[0].name === WAKE_WORD_INTENT &&
            jsonObject.intents[0].confidence >= CONFIDENCE_THRESHOLD &&
            jsonObject.type === "FINAL_UNDERSTANDING"
          ) {
            console.log(jsonObject);
            onWakeWordDetected();
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

micInstance.start();
console.log("Listening for wake word...");
