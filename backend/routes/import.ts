import express from "express";
import multer from "multer";
import { importTikTokCsv } from "../services/csvImporter";
import {
  requireAuth,
  type AuthenticatedRequest,
} from "../middleware/requireAuth";
import { expensiveJobLimiter } from "../middleware/rateLimiters";

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    const isCsvMime =
      file.mimetype === "text/csv" ||
      file.mimetype === "application/vnd.ms-excel" ||
      file.originalname.toLowerCase().endsWith(".csv");

    if (!isCsvMime) {
      return cb(new Error("Kun CSV-filer er tillatt"));
    }

    cb(null, true);
  },
});

router.post(
  "/csv",
  requireAuth,
  expensiveJobLimiter,
  upload.single("file"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const clerkUserId = req.auth?.userId;

      if (!clerkUserId) {
        return res.status(401).json({
          ok: false,
          error: "Ikke autentisert",
        });
      }

      if (!req.file) {
        return res.status(400).json({
          ok: false,
          error: "Ingen fil lastet opp",
        });
      }

      const result = await importTikTokCsv(req.file.buffer);

      return res.json(result);
    } catch (error) {
      console.error("CSV import error:", error);

      return res.status(500).json({
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Noe gikk galt under import",
      });
    }
  }
);

export default router;