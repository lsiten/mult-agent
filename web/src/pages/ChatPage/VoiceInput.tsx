import { Mic, Square, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVoiceRecording } from "@/hooks/useVoiceRecording";
import { useI18n } from "@/i18n";

interface VoiceInputProps {
  onTranscription: (text: string) => void;
  disabled?: boolean;
}

export function VoiceInput({ onTranscription, disabled }: VoiceInputProps) {
  const { t } = useI18n();
  const {
    state,
    audioBlob,
    error,
    duration,
    startRecording,
    stopRecording,
    cancelRecording,
    clearAudio,
  } = useVoiceRecording();

  const handleStartRecording = async () => {
    await startRecording();
  };

  const handleStopRecording = async () => {
    stopRecording();
    // Will transition to "processing" state when stopped
  };

  const handleCancelRecording = () => {
    cancelRecording();
  };

  // Handle transcription when audio is ready
  const handleTranscribe = async () => {
    if (!audioBlob) return;

    try {
      // Create FormData
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.webm");

      // Call STT API
      const response = await fetch("/api/stt/transcribe", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Transcription failed");
      }

      const data = await response.json();
      onTranscription(data.text);
      clearAudio();
    } catch (err) {
      console.error("Transcription error:", err);
      alert(t.chat.errors.sttFailed || "语音识别失败");
      clearAudio();
    }
  };

  // Auto-transcribe when audio is ready
  if (state === "processing" && audioBlob) {
    handleTranscribe();
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Idle state - show mic button
  if (state === "idle" || state === "error") {
    return (
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleStartRecording}
          disabled={disabled}
          title={t.chat.voiceInput || "语音输入"}
          className="h-9 w-9 p-0"
        >
          <Mic className="h-4 w-4" />
        </Button>
        {error && (
          <span className="text-xs text-error">{error}</span>
        )}
      </div>
    );
  }

  // Recording state - show stop and cancel
  if (state === "recording") {
    return (
      <div className="flex items-center gap-2 px-2 py-1 bg-error/10 rounded-lg border border-error/20">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 bg-error rounded-full animate-pulse" />
          <span className="text-sm text-error font-mono">
            {formatDuration(duration)}
          </span>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleStopRecording}
          title={t.chat.stopRecording || "停止录音"}
          className="h-7 w-7 p-0"
        >
          <Square className="h-3 w-3 fill-current" />
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleCancelRecording}
          title={t.chat.cancelRecording || "取消"}
          className="h-7 w-7 p-0"
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  // Processing state - show loader
  if (state === "processing") {
    return (
      <div className="flex items-center gap-2 px-2 py-1">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span className="text-xs text-muted-foreground">
          {t.chat.processing || "识别中..."}
        </span>
      </div>
    );
  }

  return null;
}
