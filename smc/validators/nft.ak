use aiken/collection/list
use aiken/option
use cardano/assets.{PolicyId, Value}
use cardano/transaction.{Transaction}
use config

validator nft_policy {
  mint(_redeemer: Data, policy_id: PolicyId, self: Transaction) {
    let signed_by_owner = list.has(self.extra_signatories, config.owner)
    let minted_here: Value = assets.restricted_to(self.mint, [policy_id])
    let minted_tokens =
      assets.flatten_with(
        minted_here,
        fn(p, a, q) {
          if p == policy_id && q > 0 {
            Some((a, q))
          } else {
            None
          }
        },
      )

    let exactly_one_nft =
      when minted_tokens is {
        [(_asset_name, quantity)] -> quantity == 1
        _ -> False
      }

    signed_by_owner && exactly_one_nft
  }

  else(_) {
    fail
  }
}
