import { Client } from '@elastic/elasticsearch';

const esUrl = process.env.ELASTICSEARCH_URL || 'http://localhost:9200';

export const esClient = new Client({
  node: esUrl,
  requestTimeout: 10000,
});

const INDEX = 'email-jobs';

export async function ensureIndex() {
  try {
    const exists = await esClient.indices.exists({ index: INDEX });
    if (!exists) {
      await esClient.indices.create({
        index: INDEX,
        settings: {
          number_of_shards: 1,
          number_of_replicas: 0,
        },
        mappings: {
          properties: {
            id: { type: 'integer' },
            to_email: { type: 'text' },
            subject: { type: 'text' },
            body: { type: 'text' },
            from_email: { type: 'keyword' },
            user_id: { type: 'integer' },
            status: { type: 'keyword' },
            scheduled_at: { type: 'date' },
            sent_at: { type: 'date' },
          },
        },
      });
      console.log('Elasticsearch index created:', INDEX);
    }
  } catch (err) {
    console.error('Elasticsearch ensureIndex failed:', err);
    throw err;
  }
}

export async function indexEmail(doc: {
  id: number;
  user_id: number;
  to_email: string;
  subject: string;
  body: string;
  from_email: string;
  status: string;
  scheduled_at: string;
}) {
  try {
    await esClient.index({
      index: INDEX,
      id: String(doc.id),
      document: doc,
      refresh: false,
    });
  } catch (err) {
    console.error('Elasticsearch index failed:', err);
  }
}

export async function updateEmailStatus(id: number, status: string, extra: Record<string, any> = {}) {
  try {
    await esClient.update({
      index: INDEX,
      id: String(id),
      doc: { status, ...extra },
      refresh: false,
    });
  } catch (err) {
    console.error('Elasticsearch update failed:', err);
  }
}

export async function deleteEmailIndex(id: number) {
  try {
    await esClient.delete({ index: INDEX, id: String(id) });
  } catch (err) {
    // not found is fine
  }
}

export async function searchEmails(userId: number, query: string, from = 0, size = 20, status?: string) {
  const must: any[] = [{ term: { user_id: userId } }];
  if (query && query.trim()) {
    must.push({
      multi_match: {
        query: query.trim(),
        fields: ['to_email', 'subject', 'body', 'from_email'],
      },
    });
  }
  if (status && status.trim()) {
    must.push({ term: { status: status.trim() } });
  }

  const body = {
    query: must.length ? { bool: { must } } : { match_all: {} },
    from,
    size,
    sort: [{ scheduled_at: { order: 'desc' } }],
  };

  const res = await esClient.search({
    index: INDEX,
    ...body,
  });

  const total = typeof res.hits.total === 'number' ? res.hits.total : res.hits.total?.value ?? 0;

  return {
    hits: (res.hits.hits || []).map((h: any) => ({ id: h._id, ...h._source })),
    total,
  };
}

export async function initElasticsearch() {
  await ensureIndex();
}
