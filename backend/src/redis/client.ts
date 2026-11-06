import IORedis from 'ioredis';

const redisOptions = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null as number | null,
};

function createRedis(label: string): IORedis {
  const client = new IORedis(redisOptions);
  client.on('error', (err) => console.error(`Redis ${label} error:`, err.message));
  return client;
}

export const connection = createRedis('bullmq');

export const rateLimitRedis = createRedis('rate-limit');
