declare module "mic" {
  interface MicOptions {
    rate?: string;
    channels?: string;
    debug?: boolean;
    exitOnSilence?: number;
    fileType?: string;
    [key: string]: any;
  }

  interface MicInstance {
    getAudioStream: () => NodeJS.ReadableStream;
    start: () => void;
    stop: () => void;
    pause: () => void;
    resume: () => void;
  }

  function mic(options?: MicOptions): MicInstance;

  export = mic;
}
