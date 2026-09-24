(() => {
  const load = (root = document) => {
    const hosts = root.querySelectorAll?.(".utterances-host") || [];
    hosts.forEach(host => {
      if (host.dataset.utterancesLoaded === "true") return;
      host.dataset.utterancesLoaded = "true";

      const mount = () => {
        if (host.querySelector("iframe.utterances-frame")) return;

        const script = document.createElement("script");
        script.src = "https://utteranc.es/client.js";
        script.async = true;
        script.crossOrigin = "anonymous";
        script.setAttribute("repo", "1337misterzero/blog");
        script.setAttribute("issue-term", "pathname");
        script.setAttribute("theme", "github-dark");
        host.appendChild(script);

        window.setTimeout(() => {
          if (!host.querySelector("iframe.utterances-frame")) {
            host.dataset.utterancesLoaded = "false";
            host.innerHTML = "";
          }
        }, 8000);
      };

      mount();
    });
  };

  window.initComments = load;

  document.addEventListener("DOMContentLoaded", () => load(document));
})();