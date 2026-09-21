import type { Market } from "../types";

export const MARKET_TIMES: Record<string, string> = {
  "นิคเคอิ VIP เช้า": "08:00",
  "หุ้นจีน VIP เช้า": "09:05",
  "ฮั่งเส็ง VIP เช้า": "09:35",
  "หุ้นไต้หวัน VIP": "10:35",
  "หุ้นเกาหลี VIP": "11:30",
  "นิคเคอิ VIP บ่าย": "12:30",
  "หุ้นจีน VIP บ่าย": "13:30",
  "ฮั่งเส็ง VIP บ่าย": "14:30",
  "หุ้นสิงคโปร์ VIP": "16:00",
  "ฮานอย VIP": "18:30",
  "ลาว VIP": "20:30",
  "ลาวสามัคคี VIP": "20:30",
  "ลาวสตาร์ VIP": "21:00",
  "หุ้นอังกฤษ VIP": "21:00",
  "หุ้นเยอรมัน VIP": "21:30",
  "หุ้นรัสเซีย VIP": "22:30",
  "หุ้นดาวโจนส์ VIP": "23:30",
};

function bangkokMinutes(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(
    parts.find((part) => part.type === "minute")?.value ?? 0
  );

  return hour * 60 + minute;
}

function toMinutes(time: string): number {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

export function getUpcomingMarkets(
  markets: Market[],
  now = new Date(),
  limit = 3
): Array<{ market: Market; time: string; tomorrow: boolean }> {
  const current = bangkokMinutes(now);

  const scheduled = markets
    .map((market) => {
      const time = MARKET_TIMES[market.market_name];
      if (!time) return null;

      const minutes = toMinutes(time);
      return {
        market,
        time,
        minutes,
        tomorrow: minutes <= current,
        distance: minutes > current ? minutes - current : 1440 - current + minutes,
      };
    })
    .filter(
      (
        item
      ): item is {
        market: Market;
        time: string;
        minutes: number;
        tomorrow: boolean;
        distance: number;
      } => Boolean(item)
    )
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);

  return scheduled;
}
