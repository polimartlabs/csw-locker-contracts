;; title: emergency-rules
;; version:
;; summary:
;; description:

(use-trait extension-trait .extension-trait.extension-trait)

(define-constant err-emergency-lockdown (err u401))

(define-public (is-allowed-stx
    (amount uint)
    (recipient principal)
    (memo (optional (buff 34)))
  )
  (begin
    (asserts! false err-emergency-lockdown)
    (ok true)
  )
)

(define-public (is-allowed-extension
    (extension <extension-trait>)
    (payload (buff 2048))
  )
  (begin
    (asserts! false err-emergency-lockdown)
    (ok true)
  )
)
