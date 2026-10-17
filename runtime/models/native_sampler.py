"""Checked native sampler ownership at the Python/C boundary."""

def add_grammar(chain,model,grammar):
    import llama_cpp
    sampler=llama_cpp.llama_sampler_init_grammar(model.vocab,grammar._grammar.encode('utf-8'),grammar._root.encode('utf-8'))
    # The binding's add_grammar forwards NULL without checking. Native grammar
    # parse failures must not become access violations in chain_add.
    if not sampler:raise ValueError('Native runtime rejected the tool sampling grammar; no tool was executed')
    try:llama_cpp.llama_sampler_chain_add(chain.sampler,sampler)
    except Exception:
        llama_cpp.llama_sampler_free(sampler)
        raise
