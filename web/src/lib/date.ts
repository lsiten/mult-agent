/**
 * Format a timestamp as a relative time string
 * @param timestamp - Unix timestamp in seconds
 * @param locale - Locale string (default: current locale)
 * @returns Formatted relative time string
 */
export function formatRelativeTime(timestamp: number, locale = "zh-CN"): string {
  const now = Date.now();
  const date = new Date(timestamp * 1000);
  const diffMs = now - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  const isZhCN = locale.startsWith("zh");

  // Just now (< 1 minute)
  if (diffSeconds < 60) {
    return isZhCN ? "刚刚" : "Just now";
  }

  // Minutes ago (< 1 hour)
  if (diffMinutes < 60) {
    return isZhCN ? `${diffMinutes} 分钟前` : `${diffMinutes}m ago`;
  }

  // Hours ago (< 1 day)
  if (diffHours < 24) {
    return isZhCN ? `${diffHours} 小时前` : `${diffHours}h ago`;
  }

  // Days ago (< 7 days)
  if (diffDays < 7) {
    return isZhCN ? `${diffDays} 天前` : `${diffDays}d ago`;
  }

  // Format as date for older items
  const options: Intl.DateTimeFormatOptions = {
    year: date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
    month: "short",
    day: "numeric",
  };

  return new Intl.DateTimeFormat(locale, options).format(date);
}

/**
 * Format a timestamp as a full date and time string
 * @param timestamp - Unix timestamp in seconds
 * @param locale - Locale string (default: current locale)
 * @returns Formatted date and time string
 */
export function formatDateTime(timestamp: number, locale = "zh-CN"): string {
  const date = new Date(timestamp * 1000);
  const options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  };

  return new Intl.DateTimeFormat(locale, options).format(date);
}

/**
 * Format bytes as human-readable size
 * @param bytes - Size in bytes
 * @param locale - Locale string (default: current locale)
 * @returns Formatted size string
 */
export function formatBytes(bytes: number, locale = "zh-CN"): string {
  if (bytes === 0) return locale.startsWith("zh") ? "0 字节" : "0 Bytes";

  const k = 1024;
  const sizes = locale.startsWith("zh")
    ? ["字节", "KB", "MB", "GB", "TB"]
    : ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const size = (bytes / Math.pow(k, i)).toFixed(2);

  return `${size} ${sizes[i]}`;
}
