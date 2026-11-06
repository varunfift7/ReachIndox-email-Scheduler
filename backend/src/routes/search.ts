import { Router, Request, Response } from 'express';
import { searchEmails } from '../services/elasticsearch';
import { isAuthenticated } from './auth';

const router = Router();

router.get('/', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const q = (req.query.q as string) || '';
    const status = (req.query.status as string) || '';
    const from = Math.max(0, parseInt((req.query.from as string) || '0', 10) || 0);
    const size = Math.min(100, Math.max(1, parseInt((req.query.size as string) || '20', 10) || 20));

    const result = await searchEmails(user.id, q, from, size, status || undefined);
    res.json({ hits: result.hits, total: result.total });
  } catch (err: any) {
    console.error('Search error:', err);
    res.status(500).json({ message: 'Search failed', error: err.message });
  }
});

export default router;
