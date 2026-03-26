;; title: ext-delegate-stx-pox-4
;; version:
;; summary:
;; description:
(impl-trait 'ST3FFRX7C911PZP5RHE148YDVDD9JWVS6FZRA60VS.extension-trait.extension-trait)

(define-constant err-invalid-payload (err u500))
(define-constant err-invalid-caller (err u501))

(define-data-var owner (optional principal) none)

(define-public (call (payload (buff 2048)))
  (let ((details (unwrap!
      (from-consensus-buff? {
        action: (string-ascii 10),
        amount-ustx: uint,
        delegate-to: principal,
        until-burn-ht: (optional uint),
        pox-addr: (optional {
          version: (buff 1),
          hashbytes: (buff 32),
        }),
      }
        payload
      )
      err-invalid-payload
    )))
    (if (is-none (var-get owner))
      (var-set owner (some contract-caller))
      (asserts! (is-eq (var-get owner) (some contract-caller)) err-invalid-caller)
    )
    (if (is-eq "delegate" (get action details))
      (begin
        (try! (stx-transfer? (get amount-ustx details) tx-sender current-contract))
        (try! (as-contract? ((with-stacking (get amount-ustx details)))
          (try! (as-uint-response (contract-call? 'SP000000000000000000002Q6VF78.pox-4 delegate-stx
            (get amount-ustx details) (get delegate-to details)
            (get until-burn-ht details) (get pox-addr details)
          )))
        ))
        (ok true)
      )
      (if (is-eq "revoke" (get action details))
        (begin
          (try! (match (as-contract? ()
            (try! (as-uint-response-stacking (contract-call? 'SP000000000000000000002Q6VF78.pox-4
              revoke-delegate-stx
            )))
          )
            success (ok success)
            error (err error)
          ))
          (ok true)
        )
        (let ((smart-wallet tx-sender))
          (as-contract? ((with-stx (stx-get-balance current-contract)))
            (try! (stx-transfer? (stx-get-balance current-contract) current-contract
              smart-wallet
            ))
          )
        )
      )
    )
  )
)

(define-read-only (as-uint-response (res (response bool int)))
  (match res
    success (ok success)
    error (err (to-uint error))
  )
)

(define-read-only (as-uint-response-stacking (res (response
  (optional {
    amount-ustx: uint,
    delegated-to: principal,
    pox-addr: (optional {
      hashbytes: (buff 32),
      version: (buff 1),
    }),
    until-burn-ht: (optional uint),
  })
  int
)))
  (match res
    success (ok success)
    error (err (to-uint error))
  )
)
