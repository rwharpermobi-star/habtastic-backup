// Thin wrapper for opening Android system screens relevant to push delivery.
// Uses `capacitor-native-settings` when running natively; no-op elsewhere.
import { Capacitor } from "@capacitor/core";

export type OpenResult = { ok: boolean; reason?: string };

async function openNative(option: string): Promise<OpenResult> {
  if (!Capacitor.isNativePlatform()) {
    return { ok: false, reason: "not-native" };
  }
  try {
    const mod: any = await import("capacitor-native-settings");
    const NativeSettings = mod.NativeSettings ?? mod.default?.NativeSettings ?? mod.default;
    const AndroidSettings = mod.AndroidSettings ?? mod.default?.AndroidSettings ?? {};
    const IOSSettings = mod.IOSSettings ?? mod.default?.IOSSettings ?? {};

    await NativeSettings.open({
      optionAndroid: AndroidSettings[option] ?? option,
      optionIOS: IOSSettings.App ?? "app",
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e?.message || String(e) };
  }
}

export const openAppNotificationSettings = () => openNative("AppNotification");
export const openBatteryOptimizationSettings = () => openNative("BatteryOptimization");
export const openAppSettings = () => openNative("ApplicationDetails");
