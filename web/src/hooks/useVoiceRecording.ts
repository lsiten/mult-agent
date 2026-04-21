import { useState, useCallback, useRef } from "react";

export type RecordingState = "idle" | "recording" | "processing" | "error";

export interface UseVoiceRecordingResult {
  state: RecordingState;
  audioBlob: Blob | null;
  error: string | null;
  duration: number;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  cancelRecording: () => void;
  clearAudio: () => void;
}

export function useVoiceRecording(): UseVoiceRecordingResult {
  const [state, setState] = useState<RecordingState>("idle");
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const durationIntervalRef = useRef<number | null>(null);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      setState("idle");

      // Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });

      // Create MediaRecorder
      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : "audio/wav";

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      // Handle data available
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      // Handle recording stop
      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        setAudioBlob(audioBlob);
        setState("processing");

        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());

        // Clear duration interval
        if (durationIntervalRef.current) {
          clearInterval(durationIntervalRef.current);
          durationIntervalRef.current = null;
        }
      };

      // Start recording
      mediaRecorder.start(100); // Collect data every 100ms
      setState("recording");
      startTimeRef.current = Date.now();

      // Update duration every 100ms
      durationIntervalRef.current = window.setInterval(() => {
        setDuration((Date.now() - startTimeRef.current) / 1000);
      }, 100);

    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to start recording";
      setError(message);
      setState("error");
      console.error("Recording error:", err);
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, [state]);

  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current) {
      // Stop without saving
      const recorder = mediaRecorderRef.current;
      if (recorder.state === "recording") {
        recorder.stop();
      }

      // Stop all tracks
      recorder.stream.getTracks().forEach(track => track.stop());
    }

    // Clear state
    audioChunksRef.current = [];
    setAudioBlob(null);
    setDuration(0);
    setState("idle");

    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
  }, []);

  const clearAudio = useCallback(() => {
    setAudioBlob(null);
    setDuration(0);
    setState("idle");
    setError(null);
  }, []);

  return {
    state,
    audioBlob,
    error,
    duration,
    startRecording,
    stopRecording,
    cancelRecording,
    clearAudio,
  };
}
