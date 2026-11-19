"use client"

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { Check, Download, RotateCw, Smartphone, WifiOff, X } from "lucide-react"

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> }
type PwaContextValue = { offline: boolean; installed: boolean; canInstall: boolean; updateReady: boolean; install: () => Promise<void>; update: () => void; installHint: string; dismissInstallHint: () => void }
const PwaContext = createContext<PwaContextValue | null>(null)

export function PwaProvider({ children }: { children: ReactNode }) {
  const [offline, setOffline] = useState(false)
  const [installed, setInstalled] = useState(false)
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null)
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null)
  const [updateReady, setUpdateReady] = useState(false)
  const [installHint, setInstallHint] = useState("")

  useEffect(() => {
    const standalone = () => window.matchMedia("(display-mode: standalone)").matches || ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
    const updateOnlineState = () => setOffline(!navigator.onLine)
    const onInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as InstallPromptEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setInstallPrompt(null)
      setInstallHint("")
    }
    setOffline(!navigator.onLine)
    setInstalled(standalone())
    window.addEventListener("online", updateOnlineState)
    window.addEventListener("offline", updateOnlineState)
    window.addEventListener("beforeinstallprompt", onInstallPrompt)
    window.addEventListener("appinstalled", onInstalled)

    let active = true
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).then((nextRegistration) => {
        if (!active) return
        setRegistration(nextRegistration)
        setUpdateReady(Boolean(nextRegistration.waiting))
        nextRegistration.addEventListener("updatefound", () => {
          const installing = nextRegistration.installing
          installing?.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) setUpdateReady(true)
          })
        })
      }).catch(() => undefined)
    }

    return () => {
      active = false
      window.removeEventListener("online", updateOnlineState)
      window.removeEventListener("offline", updateOnlineState)
      window.removeEventListener("beforeinstallprompt", onInstallPrompt)
      window.removeEventListener("appinstalled", onInstalled)
    }
  }, [])

  const install = async () => {
    const installHelp = "Use your browser menu to install THALOS. On iPhone or iPad, choose Share, then Add to Home Screen."
    if (!installPrompt) {
      setInstallHint(installHelp)
      return
    }
    try {
      await installPrompt.prompt()
      const choice = await installPrompt.userChoice
      setInstallHint(choice.outcome === "accepted" ? "THALOS is being added to your device." : installHelp)
    } catch {
      setInstallHint(installHelp)
    } finally {
      setInstallPrompt(null)
    }
  }
  const update = () => {
    const waiting = registration?.waiting
    setUpdateReady(false)
    if (!waiting) {
      void registration?.update()
      return
    }
    navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), { once: true })
    waiting.postMessage({ type: "SKIP_WAITING" })
  }
  const value = useMemo(() => ({ offline, installed, canInstall: Boolean(installPrompt), updateReady, install, update, installHint, dismissInstallHint: () => setInstallHint("") }), [offline, installed, installPrompt, registration, updateReady, installHint])

  return <PwaContext.Provider value={value}>{children}<PwaFeedback offline={offline} updateReady={updateReady} update={update}/></PwaContext.Provider>
}

export function usePwaStatus() {
  const context = useContext(PwaContext)
  if (!context) throw new Error("usePwaStatus must be used inside PwaProvider")
  return context
}

export function PwaInstallButton() {
  const { installed, canInstall, install, installHint, dismissInstallHint } = usePwaStatus()
  return <div className="pwa-install-wrap">
    <button className="pwa-install-button" type="button" onClick={() => void install()} aria-label={installed ? "THALOS is installed" : "Install THALOS"} title={installed ? "Installed" : "Install THALOS"} disabled={installed}>
      {installed ? <Check size={15}/> : <Download size={15}/>}<span>{installed ? "Installed" : canInstall ? "Install" : "Get app"}</span>
    </button>
    {installHint && <div className="install-hint" role="status"><span>{installHint}</span><button type="button" onClick={dismissInstallHint} aria-label="Dismiss install guidance"><X size={14}/></button></div>}
  </div>
}

function PwaFeedback({ offline, updateReady, update }: { offline: boolean; updateReady: boolean; update: () => void }) {
  const [portraitDismissed, setPortraitDismissed] = useState(false)
  return <>
    {offline && <div className="network-banner" role="status"><WifiOff size={15}/><span>Offline mode · records are not cached</span></div>}
    {updateReady && <div className="pwa-update-banner" role="status"><span>A THALOS update is ready.</span><button type="button" onClick={update}>Reload to update</button></div>}
    {!portraitDismissed && <div className="portrait-guidance" aria-label="Landscape orientation suggestion">
      <div className="portrait-card"><div className="portrait-icon"><Smartphone size={24}/><RotateCw size={14}/></div><span className="eyebrow">HANDHELD COMMAND MODE</span><h2>Turn your device for the full THALOS experience.</h2><p>Landscape is designed for more room. You can keep working in portrait if that suits you.</p><button type="button" className="portrait-continue" onClick={() => setPortraitDismissed(true)}>Continue in portrait</button><button type="button" className="portrait-dismiss" onClick={() => setPortraitDismissed(true)} aria-label="Dismiss landscape suggestion"><X size={16}/></button></div>
    </div>}
  </>
}
