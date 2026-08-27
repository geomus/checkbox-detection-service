FROM public.ecr.aws/lambda/python:3.13

COPY requirements.txt ${LAMBDA_TASK_ROOT}
RUN pip install --no-cache-dir -r requirements.txt

COPY handler.py detection.py ${LAMBDA_TASK_ROOT}

CMD ["handler.handler"]
