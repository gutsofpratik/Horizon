"""Memory-conscious text completion training helpers for frozen 4-bit bases."""
def completion_window(labels):
    valid=[index for index,value in enumerate(labels) if value!=-100]
    if not valid or valid[0]==0 or valid!=list(range(valid[0],len(labels))):raise ValueError('Training labels must be one assistant completion following a masked prompt')
    return len(valid)+1,labels[valid[0]:]

def prepare_frozen_base(model):
    # Do not promote multi-gigabyte frozen embeddings/lm_head to float32.
    # Norm arithmetic in Qwen3.5 already accumulates in float32.
    for parameter in model.parameters():parameter.requires_grad_(False)
    model.config.use_cache=False
    return model

def completion_loss(model,ids,labels):
    import torch
    window,targets=completion_window(labels)
    inputs=torch.tensor([ids],device=model.device);mask=torch.ones_like(inputs)
    result=model(input_ids=inputs,attention_mask=mask,logits_to_keep=window,use_cache=False)
    logits=result.logits[:,:-1,:].float()
    return torch.nn.functional.cross_entropy(logits.reshape(-1,logits.shape[-1]),torch.tensor(targets,device=model.device))
