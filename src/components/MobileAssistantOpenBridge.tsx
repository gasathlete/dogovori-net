import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";

/**
 * На телефон не показваме плаващ AI балон. Затова тук слушаме същото събитие
 * `dogovai:open`, което ползват бутоните в началната страница и профила, и
 * отваряме пълния екран на DogovaryAI вместо тихо нищо.
 */
export function MobileAssistantOpenBridge() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const onOpen = () => {
      if (!location.pathname.startsWith("/assistant")) navigate("/assistant");
    };
    window.addEventListener("dogovai:open", onOpen);
    return () => window.removeEventListener("dogovai:open", onOpen);
  }, [navigate, location.pathname]);

  return null;
}
