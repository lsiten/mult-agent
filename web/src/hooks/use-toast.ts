// Simple toast hook for showing notifications
export function useToast() {
  return {
    toast: ({ title, description, variant }: {
      title: string;
      description?: string;
      variant?: 'default' | 'destructive';
    }) => {
      // Use browser's native notification for now
      // In a real implementation, this would connect to a toast component
      console.log(`[Toast ${variant}] ${title}${description ? `: ${description}` : ''}`);

      // Could also use window.alert for simple feedback
      if (variant === 'destructive') {
        alert(`Error: ${title}${description ? `\n${description}` : ''}`);
      }
    },
  };
}
