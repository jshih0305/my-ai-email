import DailyBriefView from "./daily-brief-view";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-zinc-50 font-sans dark:bg-black">
      <DailyBriefView />
    </div>
  );
}
