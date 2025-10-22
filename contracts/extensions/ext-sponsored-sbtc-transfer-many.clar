;; title: ext-sbtc-transfer-many
;; version: 1.0
;; summary: Transfers SBTC tokens to many recipients
;; description:

(define-constant ERR_TRANSFER_INDEX_PREFIX u1000)

(define-constant err-invalid-payload (err u500))

(define-private (sbtc-transfer-many (recipients (list 200 {
  amount: uint,
  to: principal,
})))
  (fold sbtc-transfer-many-iter recipients (ok u0))
)

(define-private (sbtc-transfer-many-iter
    (individual-transfer {
      amount: uint,
      to: principal,
    })
    (result (response uint uint))
  )
  (match result
    index (begin
      (unwrap!
        (sbtc-transfer (get amount individual-transfer) tx-sender
          (get to individual-transfer)
        )
        (err (+ ERR_TRANSFER_INDEX_PREFIX index))
      )
      (ok (+ index u1))
    )
    err-index (err err-index)
  )
)

(define-private (sbtc-transfer
    (amount uint)
    (from principal)
    (to principal)
  )
  (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token transfer
    amount from to none
  )
)

(define-public (call (payload (buff 2048)))
  (let ((details (unwrap!
      (from-consensus-buff? {
        recipients: (list
          200
          {
            amount: uint,
            to: principal,
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
