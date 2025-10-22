;; title: ext-sbtc-transfer-many
;; version: 1.0
;; summary: Transfers SBTC tokens to many recipients
;; description:

(define-constant err-invalid-payload (err u500))

(define-private (sbtc-transfer
    (amount uint)
    (from principal)
    (to principal)
  )
  (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token transfer
    amount from to none
  )
)

(define-private (sbtc-transfer-many (recipients (list
  200
  {
    amount: uint,
    sender: principal,
    to: principal,
    memo: (optional (buff 34)),
  }
)))
  (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token
    transfer-many recipients
  )
)

(define-public (call (payload (buff 2048)))
  (let ((details (unwrap!
      (from-consensus-buff? {
        recipients: (list
          200
          {
            amount: uint,
            sender: principal,
            to: principal,
            memo: (optional (buff 34)),
          }
        ),
        fees: uint,
      }
        payload
      )
      err-invalid-payload
    )))
    (try! (sbtc-transfer-many (get recipients details)))
    (match tx-sponsor?
      spnsr (let ((fees (get fees details)))
        (and (> fees u0) (try! (sbtc-transfer fees tx-sender spnsr)))
      )
      true
    )
    (ok true)
  )
)
