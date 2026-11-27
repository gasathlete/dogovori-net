const clientToken = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN as string | undefined;

export function PaymentTestModeBanner() {
  if (!clientToken?.startsWith("pk_test_")) return null;
  return (
    <div className="w-full border-b border-orange-300 bg-orange-100 px-4 py-2 text-center text-xs text-orange-800">
      Всички плащания в preview режим са тестови.
    </div>
  );
}
