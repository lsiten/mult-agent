import { useState, useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";

interface LazyImageProps {
  src: string;
  alt: string;
  className?: string;
  onClick?: () => void;
}

export function LazyImage({ src, alt, className, onClick }: LazyImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const imgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!imgRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            observer.disconnect();
          }
        });
      },
      {
        rootMargin: "50px", // Start loading 50px before visible
      }
    );

    observer.observe(imgRef.current);

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={imgRef} className={className}>
      {!isInView && (
        <div className="flex items-center justify-center bg-muted rounded-lg aspect-video">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {isInView && (
        <>
          {!isLoaded && (
            <div className="flex items-center justify-center bg-muted rounded-lg aspect-video">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}
          <img
            src={src}
            alt={alt}
            className={`${className} ${isLoaded ? "opacity-100" : "opacity-0"} transition-opacity duration-300`}
            onClick={onClick}
            onLoad={() => setIsLoaded(true)}
            style={{ display: isLoaded ? "block" : "none" }}
          />
        </>
      )}
    </div>
  );
}
