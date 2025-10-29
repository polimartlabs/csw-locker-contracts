;; title: ext-sbtc-transfer-many-native
;; version: 1.0
;; summary: Transfers SBTC tokens to many recipients
;; description: Optimized for gas efficiency.

(define-constant ERR_TRANSFER_INDEX_PREFIX u1000)

(define-constant err-invalid-payload (err u500))

;; Uses native transfer-many function with standard tuple format. More
;; efficient cost-wise but supports fewer recipients.
;;
;; Max recipients:
;; - 19 standard principals
;; - 5 contract principals
(define-private (sbtc-transfer-many-native (recipients (list 200
  {
  amount: uint,
  sender: principal,
  to: principal,
  memo: (optional (buff 34)),
})))
  (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token
    transfer-many recipients
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
    (try! (sbtc-transfer-many-native (get recipients details)))
    (match tx-sponsor?
      spnsr (let ((fees (get fees details)))
        (and (> fees u0) (try! (sbtc-transfer fees tx-sender spnsr)))
      )
      true
    )
    (ok true)
  )
)
