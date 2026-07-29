// Embed layout — stripped down, no sidebar/header
// Designed to be loaded inside WorkAdventure iframe popups
export const dynamic = "force-dynamic";

export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      {children}
    </div>
  );
}