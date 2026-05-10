#!/usr/bin/env python3
import sys
import os
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
FINGERTIP_IDS = [4, 8, 12, 16, 20]   # thumb → pinky tips
REMBG_MODEL = "isnet-general-use"
REMBG_MAX_DIM = 900


def build_hand_mask(img_rgb, h, w):
    """Convex-hull of each detected hand + extra blobs at fingertips."""
    mask = np.zeros((h, w), dtype=np.uint8)
    if not hasattr(mp, "solutions"):
        return mask
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


def clean_alpha(alpha):
    """Keep the cutout crisp while removing small holes and edge speckles."""
    alpha = np.where(alpha >= 248, 255, alpha)
    alpha = np.where(alpha <= 6, 0, alpha).astype(np.uint8)

    h, w = alpha.shape
    close_size = max(int(min(w, h) * 0.003), 3)
    if close_size % 2 == 0:
        close_size += 1
    close_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (close_size, close_size))
    alpha = cv2.morphologyEx(alpha, cv2.MORPH_CLOSE, close_kernel)

    hard = (alpha > 24).astype(np.uint8) * 255
    edge_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    edge_band = cv2.dilate(hard, edge_kernel) - cv2.erode(hard, edge_kernel)
    blurred = cv2.GaussianBlur(alpha, (3, 3), 0)
    alpha = np.where(edge_band > 0, blurred, alpha)

    solid = cv2.erode((alpha > 230).astype(np.uint8) * 255, edge_kernel)
    alpha = np.where(solid > 0, 255, alpha)
    return alpha.astype(np.uint8)


def remove_background(input_path, output_path):
    # ── 1. Figure segmentation cutout ────────────────────────────────────────
    session  = new_session(REMBG_MODEL, providers=["CPUExecutionProvider"])
    pil_in   = Image.open(input_path).convert("RGB")
    orig_w, orig_h = pil_in.size
    scale = min(1.0, REMBG_MAX_DIM / max(orig_w, orig_h))
    rembg_in = (
        pil_in.resize((int(orig_w * scale), int(orig_h * scale)), Image.Resampling.LANCZOS)
        if scale < 1.0
        else pil_in
    )
    pil_out  = remove(rembg_in, session=session).convert("RGBA")

    img_rgb  = np.array(pil_in)
    alpha_small = Image.fromarray(np.array(pil_out)[:, :, 3])
    alpha = np.array(alpha_small.resize((orig_w, orig_h), Image.Resampling.LANCZOS))
    h, w     = img_rgb.shape[:2]
    img_bgr  = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2BGR)

    # ── 2. MediaPipe Hands: recover fingers the model may clip ───────────────
    hands_mask = build_hand_mask(img_rgb, h, w)

    # ── 3. YOLO Pose: recover feet / ankles ──────────────────────────────────
    pose_model = YOLO("yolo11s-pose.pt")
    scale      = min(1.0, 1280 / max(h, w))
    inf_bgr    = cv2.resize(img_bgr, (int(w*scale), int(h*scale))) if scale < 1.0 else img_bgr
    pose_res   = pose_model(inf_bgr, verbose=False)[0]
    feet_mask  = build_foot_mask(pose_res, h, w, scale)

    # ── 4. Merge extras only where adjacent to the segmentation mask ─────────
    # This prevents spurious blobs in corners where MediaPipe fires incorrectly
    alpha_bin    = (alpha > 30).astype(np.uint8) * 255
    proximity_k  = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (71, 71))
    near_body    = cv2.dilate(alpha_bin, proximity_k)
    alpha = np.maximum(alpha, hands_mask & (near_body > 0))
    alpha = np.maximum(alpha, feet_mask  & (near_body > 0))

    # ── 5. Local alpha cleanup ───────────────────────────────────────────────
    alpha = clean_alpha(alpha)

    Image.fromarray(np.dstack([img_rgb, alpha])).save(output_path, "PNG")


if __name__ == "__main__":
    try:
        remove_background(sys.argv[1], sys.argv[2])
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
