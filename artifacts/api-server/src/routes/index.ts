import { Router, type IRouter } from "express";
import healthRouter from "./health";
import orgsRouter from "./orgs";

const router: IRouter = Router();

router.use(healthRouter);
router.use(orgsRouter);

export default router;
