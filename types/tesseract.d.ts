declare module 'tesseract.js' {
  export type LoggerMessage = {
    status: string;
    progress: number;
  };

  export type RecognizeOptions = {
    logger?: (message: LoggerMessage) => void;
  };

  export type RecognizeResult = {
    data: {
      text: string;
    };
  };

  export function recognize(
    image: string | ArrayBuffer | Blob | File,
    langs?: string,
    options?: RecognizeOptions,
  ): Promise<RecognizeResult>;

  const Tesseract: {
    recognize: typeof recognize;
  };

  export default Tesseract;
}
