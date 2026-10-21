// ==============================================================================
// UTILITY: src/lib/auth/biometrics.ts
// Modul Autentikasi Biometrik (Sidik Jari / Face ID)
// Mendukung 2 Mode:
// 1. Android Native Bridge (di dalam APK Keuangan Keluarga)
// 2. WebAuthn API Standar (di peramban modern Chrome Android / Safari iOS)
// ==============================================================================

// Interface untuk Android JavaScript Interface bawaan APK
declare global {
  interface Window {
    AndroidBridge?: {
      isBiometricsAvailable: () => boolean;
      authenticateBiometric: (title: string, subtitle: string) => void;
      getDeviceId: () => string;
      onBiometricSuccess?: () => void;
      onBiometricFailed?: (reason: string) => void;
    };
  }
}

export interface BiometricAvailability {
  available: boolean;
  type: 'android_native' | 'webauthn' | 'none';
  label: string;
}

/**
 * Periksa apakah perangkat mendukung autentikasi biometrik
 */
export async function checkBiometricsAvailability(): Promise<BiometricAvailability> {
  if (typeof window === 'undefined') {
    return { available: false, type: 'none', label: 'Tidak tersedia di server' };
  }

  // 1. Periksa apakah berjalan di dalam Android Native APK
  if (window.AndroidBridge && typeof window.AndroidBridge.isBiometricsAvailable === 'function') {
    try {
      const isAvailable = window.AndroidBridge.isBiometricsAvailable();
      if (isAvailable) {
        return {
          available: true,
          type: 'android_native',
          label: 'Sensor Sidik Jari Android (Native)',
        };
      }
    } catch {
      // Abaikan jika pemanggilan gagal
    }
  }

  // 2. Periksa WebAuthn API standar peramban
  if (
    window.PublicKeyCredential &&
    typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function'
  ) {
    try {
      const available = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      if (available) {
        return {
          available: true,
          type: 'webauthn',
          label: 'Biometrik Bawaan Ponsel (WebAuthn)',
        };
      }
    } catch {
      // Abaikan jika tidak didukung
    }
  }

  return { available: false, type: 'none', label: 'Biometrik tidak didukung' };
}

/**
 * Jalankan verifikasi biometrik
 */
export async function authenticateWithBiometrics(
  title = 'Buka Dasbor Keuangan',
  subtitle = 'Sentuh sensor sidik jari ponsel Anda'
): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  // 1. Jalankan via Android Native Bridge jika tersedia
  if (window.AndroidBridge && typeof window.AndroidBridge.authenticateBiometric === 'function') {
    return new Promise((resolve) => {
      // Pasang handler callback sementara
      window.AndroidBridge!.onBiometricSuccess = () => {
        resolve(true);
      };
      window.AndroidBridge!.onBiometricFailed = () => {
        resolve(false);
      };

      try {
        window.AndroidBridge!.authenticateBiometric(title, subtitle);
      } catch {
        resolve(false);
      }
    });
  }

  // 2. Jalankan via WebAuthn API
  if (window.PublicKeyCredential) {
    try {
      const challenge = new Uint8Array(32);
      crypto.getRandomValues(challenge);

      const credential = await navigator.credentials.get({
        publicKey: {
          challenge,
          timeout: 60000,
          userVerification: 'required',
          rpId: window.location.hostname,
        },
      });

      return !!credential;
    } catch {
      // Pengguna membatalkan atau sensor gagal
      return false;
    }
  }

  return false;
}
