import express from "express";
import {
  signUp,
  forgotPassword,
  login,
  logout,
  protect,
  resetPassword,
  restrictTo,
  updatePassword,
} from "../controllers/authController.js";
import {
  getAllUsers,
  getMe,
  getOneUser,
  updateMe,
  deleteMe,
} from "../controllers/userController.js";

const router = express.Router();

router.post("/signUp", signUp);
router.post("/login", login);
router.post("/logout", logout);
router.post("/forgotPassword", forgotPassword);
router.post("/resetPassword", resetPassword);

router.use(protect);

router.patch("/updatePassword", updatePassword);

router.get("/getAllUsers", restrictTo("admin"), getAllUsers);

router.get("/getOneUser/:id", restrictTo("admin"), getOneUser);

router.get("/me", getMe);

router.patch("/updateMe", updateMe);

router.delete("/me", deleteMe);

export default router;
