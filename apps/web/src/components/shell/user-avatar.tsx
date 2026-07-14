import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function UserAvatar({
  userId,
  name,
  hasPhoto,
  className,
}: {
  userId: string;
  name: string;
  hasPhoto?: boolean;
  className?: string;
}) {
  return (
    <Avatar className={cn("size-8", className)}>
      {hasPhoto !== false && <AvatarImage src={`/api/avatar/${userId}`} alt={name} />}
      <AvatarFallback className="text-xs">{initials(name)}</AvatarFallback>
    </Avatar>
  );
}
