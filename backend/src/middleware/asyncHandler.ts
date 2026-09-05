import { NextFunction, Request, Response } from 'express';

// Express 4 does not forward a rejected promise from an async handler to
// the error middleware — it hangs the request instead. Wrap every async
// handler/middleware with this so a thrown/rejected error reaches the
// app-level error handler in src/index.ts.
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}
