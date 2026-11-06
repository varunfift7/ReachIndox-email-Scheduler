import { rateLimitRedis } from '../redis/client';

const parsedGlobal = parseInt(process.env.MAX_EMAILS_PER_HOUR || '200', 10);
const parsedPerSender = parseInt(process.env.MAX_EMAILS_PER_HOUR_PER_SENDER || '50', 10);

export const maxPerHourGlobal = Number.isFinite(parsedGlobal) && parsedGlobal > 0 ? parsedGlobal : 200;
export const maxPerHourPerSender = Number.isFinite(parsedPerSender) && parsedPerSender > 0 ? parsedPerSender : 50;

export const HOUR_MS = 60 * 60 * 1000;

export function currentHourWindow(): number {
  return Math.floor(Date.now() / HOUR_MS);
}

const CONSUME_SLOT_SCRIPT = `
local senderKey = KEYS[1]
local globalKey = KEYS[2]
local senderLimit = tonumber(ARGV[1])
local globalLimit = tonumber(ARGV[2])
local ttl = tonumber(ARGV[3])

local senderCount = tonumber(redis.call('GET', senderKey) or '0')
local globalCount = tonumber(redis.call('GET', globalKey) or '0')

if senderCount >= senderLimit then
  return {0, senderCount, globalCount}
end
if globalCount >= globalLimit then
  return {0, senderCount, globalCount}
end

senderCount = redis.call('INCR', senderKey)
redis.call('EXPIRE', senderKey, ttl)
globalCount = redis.call('INCR', globalKey)
redis.call('EXPIRE', globalKey, ttl)

return {1, senderCount, globalCount}
`;

export interface SendSlotResult {
  allowed: boolean;
  senderCount: number;
  globalCount: number;
  reason?: 'sender' | 'global';
}

export async function consumeSendSlot(
  sender: string,
  senderLimit: number = maxPerHourPerSender
): Promise<SendSlotResult> {
  const window = currentHourWindow();
  const safeSenderLimit = Math.max(1, Math.floor(senderLimit));
  const senderKey = `hourcount:${sender}:${window}`;
  const globalKey = `hourcount:global:${window}`;

  const raw = (await rateLimitRedis.eval(
    CONSUME_SLOT_SCRIPT,
    2,
    senderKey,
    globalKey,
    String(safeSenderLimit),
    String(maxPerHourGlobal),
    String(60 * 60 * 2)
  )) as [number, number, number];

  const allowed = Number(raw[0]) === 1;
  const senderCount = Number(raw[1]);
  const globalCount = Number(raw[2]);

  return {
    allowed,
    senderCount,
    globalCount,
    reason: allowed ? undefined : senderCount >= safeSenderLimit ? 'sender' : 'global',
  };
}

export async function getRemaining(
  sender: string,
  senderLimit: number = maxPerHourPerSender
): Promise<{ globalRemaining: number; senderRemaining: number }> {
  const window = currentHourWindow();
  const safeSenderLimit = Math.max(1, Math.floor(senderLimit));

  const [globalCountStr, senderCountStr] = await rateLimitRedis
    .mget(`hourcount:global:${window}`, sender ? `hourcount:${sender}:${window}` : '')
    .catch(() => [null, null] as Array<string | null>);

  const globalCount = globalCountStr ? parseInt(globalCountStr, 10) || 0 : 0;
  const senderCount = sender && senderCountStr ? parseInt(senderCountStr, 10) || 0 : 0;

  return {
    globalRemaining: Math.max(0, maxPerHourGlobal - globalCount),
    senderRemaining: Math.max(0, safeSenderLimit - senderCount),
  };
}
