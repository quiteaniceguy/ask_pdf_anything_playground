#!/usr/bin/env python3
import sys
import os
import io
import types

os.environ.setdefault("YOLO_AUTOINSTALL", "false")
if "pi_heif" not in sys.modules:
    _stub = types.ModuleType("pi_heif")
    _stub.register_heif_opener = lambda *a, **kw: None
    sys.modules["pi_heif"] = _stub

import numpy as np
from PIL import Image
import cv2
import mediapipe as mp
from rembg import remove, new_session
from ultralytics import YOLO

# MediaPipe hand landmark indices
ALL_HAND_LMS  = list(range(21))
FINGERTIP_IDS = [4, 8, 12, 16, 20]   # thumb → pinky tips


def build_hand_mask(img_rgb, h, w):
    """Convex-hull of each detected hand + extra blobs at fingertips."""
    mask = np.zeros((h, w), dtype=np.uint8)
    with mp.solutions.hands.Hands(
        static_image_mode=True, max_num_hands=2, min_detection_confidence=0.25
    ) as det:
        res = det.process(img_rgb)
    if not res.multi_hand_landmarks:
        return mask
    tip_r = max(int(min(h, w) * 0.022), 14)
    for hand_lms in res.multi_hand_landmarks:
        pts = [(int(lm.x * w), int(lm.y * h)) for lm in hand_lms.landmark]
        cv2.fillPoly(mask, [cv2.convexHull(np.array(pts))], 255)
        for tid in FINGERTIP_IDS:
            cv2.circle(mask, pts[tid], tip_r, 255, -1)
    return mask


def build_foot_mask(pose_result, h, w, scale):
    """Circles at detected ankles from YOLO pose."""
    mask = np.zeros((h, w), dtype=np.uint8)
    if pose_result.keypoints is None or pose_result.boxes is None:
        return mask
    for idx, kps in enumerate(pose_result.keypoints.data):
        kps_np = kps.cpu().numpy()
        box    = pose_result.boxes.xyxy[idx].cpu().numpy() / scale
        box_h  = float(box[3] - box[1])
        for kp_idx, frac in {15: 0.08, 16: 0.08}.items():
            x, y, c = kps_np[kp_idx][0]/scale, kps_np[kp_idx][1]/scale, kps_np[kp_idx][2]
            if c > 0.2:
                cv2.circle(mask, (int(x), int(y)), max(int(box_h * frac), 18), 255, -1)
    return mask


def remove_background(input_path, output_path):
    # ── 1. BiRefNet portrait: state-of-the-art human cutout ──────────────────
    session  = new_session("birefnet-portrait")
    pil_in   = Image.open(input_path).convert("RGB")
    pil_out  = remove(pil_in, session=session).convert("RGBA")

    img_rgb  = np.array(pil_out)[:, :, :3]
    alpha    = np.array(pil_out)[:, :, 3]
    h, w     = img_rgb.shape[:2]
    img_bgr  = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2BGR)

    # ── 2. MediaPipe Hands: recover fingers BiRefNet clipped ──────────────────
    hands_mask = build_hand_mask(img_rgb, h, w)

    # ── 3. YOLO Pose: recover feet / ankles ──────────────────────────────────
    pose_model = YOLO("yolo11s-pose.pt")
    scale      = min(1.0, 1280 / max(h, w))
    inf_bgr    = cv2.resize(img_bgr, (int(w*scale), int(h*scale))) if scale < 1.0 else img_bgr
    pose_res   = pose_model(inf_bgr, verbose=False)[0]
    feet_mask  = build_foot_mask(pose_res, h, w, scale)

    # ── 4. Merge extras only where they're adjacent to BiRefNet's mask ────────
    # This prevents spurious blobs in corners where MediaPipe fires incorrectly
    alpha_bin    = (alpha > 30).astype(np.uint8) * 255
    proximity_k  = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (71, 71))
    near_body    = cv2.dilate(alpha_bin, proximity_k)
    alpha = np.maximum(alpha, hands_mask & (near_body > 0))
    alpha = np.maximum(alpha, feet_mask  & (near_body > 0))

    # ── 5. Light close to fill micro-gaps at merged boundaries ───────────────
    ksize  = max(int(min(w, h) * 0.005), 5)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (ksize, ksize))
    alpha  = cv2.morphologyEx(alpha, cv2.MORPH_CLOSE, kernel)

    # ── 6. Feathered edge ─────────────────────────────────────────────────────
    blurred = cv2.GaussianBlur(alpha, (11, 11), 0)
    inner   = cv2.erode(alpha, kernel, iterations=2)
    alpha   = np.where(inner > 200, 255, blurred).astype(np.uint8)

    Image.fromarray(np.dstack([img_rgb, alpha])).save(output_path, "PNG")


if __name__ == "__main__":
    try:
        remove_background(sys.argv[1], sys.argv[2])
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
