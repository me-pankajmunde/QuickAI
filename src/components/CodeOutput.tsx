import React, { useEffect, useRef, useState } from "react";
import hljs from "highlight.js";

interface Props {
  code: string;
  language?: string;
  showLineNumbers?: boolean;
  isDiff?: boolean;
}

export const CodeOutput: React.FC<Props> = ({
  code,
  language,
  showLineNumbers = true,
  isDiff = false,
}) => {
  const codeRef = useRef<HTMLElement>(null);
  const [detected, setDetected] = useState<string>(language ?? "plaintext");

  useEffect(() => {
    if (!codeRef.current) return;

    const el = codeRef.current;
    el.removeAttribute("data-highlighted");
    el.textContent = code;

    if (language) {
      el.className = `language-${language}`;
      setDetected(language);
    } else {
      const result = hljs.highlightAuto(code);
      el.className = `language-${result.language ?? "plaintext"}`;
      setDetected(result.language ?? "plaintext");
    }

    hljs.highlightElement(el);
  }, [code, language]);

  if (!code) return null;

  return (
    <div className={`code-output ${isDiff ? "code-output--diff" : ""}`}>
      <div className="code-output__header">
        <span className="code-output__lang">{detected}</span>
        {isDiff && <span className="code-output__badge">diff</span>}
      </div>
      <div className={`code-output__wrapper ${showLineNumbers ? "code-output__wrapper--lined" : ""}`}>
        {showLineNumbers && (
          <div className="code-output__linenos" aria-hidden="true">
            {code.split("\n").map((_, i) => (
              <span key={i}>{i + 1}</span>
            ))}
          </div>
        )}
        <pre className="code-output__pre">
          <code ref={codeRef} />
        </pre>
      </div>
    </div>
  );
};
