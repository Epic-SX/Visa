/**
 * Ticket 20: ScreenID × Entitlement
 * 画面IDとEntitlement条件の対応定義
 */

/** 必須アンロック条件（Screen ID 対応） */
export const SCREEN_ENTITLEMENT_MAP = {
  /** C-50: Better診断結果画面 */
  'C-50': 'CLIENT_BETTER_UNLOCKED',
  /** C-70: Best診断結果画面 */
  'C-70': 'CLIENT_BEST_UNLOCKED',
  /** C-83: マッチング画面 */
  'C-83': 'CLIENT_MATCHING_UNLOCKED',
  /** C-95: セットプラン関連画面 */
  'C-95': 'CLIENT_SET_UNLOCKED',
} as const;

export type ScreenId = keyof typeof SCREEN_ENTITLEMENT_MAP;
export type RequiredFeature = (typeof SCREEN_ENTITLEMENT_MAP)[ScreenId];
